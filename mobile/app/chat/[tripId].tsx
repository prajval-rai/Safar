import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar, usePalette } from '@/components/ui';
import { ApiError, api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import type { ChatMessage } from '@/lib/types';

const POLL_MS = 4000;

/** The trip's group chat. Polls for new messages while open (the backend
 *  pushes a notification to everyone else, and knows you're reading). */
export default function ChatScreen() {
  const colors = usePalette();
  const insets = useSafeAreaInsets();
  const { tripId, title } = useLocalSearchParams<{ tripId: string; title?: string }>();
  const { user } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const listRef = useRef<FlatList<ChatMessage>>(null);
  const lastId = useRef<number | null>(null);

  const poll = useCallback(async () => {
    if (!tripId) return;
    try {
      const after = lastId.current;
      const fresh = await api<ChatMessage[]>(`/api/trips/${tripId}/chat/${after ? `?after=${after}` : ''}`);
      if (fresh.length) lastId.current = fresh[fresh.length - 1].id;
      setMessages((old) => (after && old ? [...old, ...fresh] : fresh));
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't reach the chat.");
    }
  }, [tripId]);

  useEffect(() => {
    poll();
    const timer = setInterval(poll, POLL_MS);
    return () => clearInterval(timer);
  }, [poll]);

  async function send() {
    const body = text.trim();
    if (!body || !tripId) return;
    setSending(true);
    try {
      await api(`/api/trips/${tripId}/chat/`, { method: 'POST', body: { text: body } });
      setText('');
      await poll();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't send that.");
    } finally {
      setSending(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      <Stack.Screen options={{ title: title ? `${title} · chat` : 'Group chat' }} />
      {messages === null ? (
        <View style={styles.center}>
          {error ? <Text style={{ color: colors.danger }}>{error}</Text> : <ActivityIndicator />}
        </View>
      ) : (
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(m) => String(m.id)}
          contentContainerStyle={styles.list}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
          ListEmptyComponent={
            <Text style={{ color: colors.muted, textAlign: 'center', marginTop: 40 }}>
              No messages yet. Say hello to the group 👋
            </Text>
          }
          renderItem={({ item, index }) => {
            const mine = item.user.id === user?.id;
            const prev = messages[index - 1];
            const showName = !mine && (!prev || prev.user.id !== item.user.id);
            return (
              <View style={[styles.row, mine && { justifyContent: 'flex-end' }]}>
                {!mine ? (
                  <View style={{ width: 32 }}>{showName ? <Avatar emoji={item.user.avatar_emoji} size={32} /> : null}</View>
                ) : null}
                <View
                  style={[
                    styles.bubble,
                    mine
                      ? { backgroundColor: colors.highlight, borderBottomRightRadius: 6 }
                      : { backgroundColor: colors.card, borderBottomLeftRadius: 6 },
                  ]}
                >
                  {showName ? (
                    <Text style={{ color: colors.tint, fontSize: 12, fontWeight: '700', marginBottom: 2 }}>{item.user.name}</Text>
                  ) : null}
                  <Text style={{ color: mine ? colors.onHighlight : colors.text, fontSize: 15, lineHeight: 21 }}>{item.text}</Text>
                  <Text style={{ color: mine ? 'rgba(0,0,0,0.5)' : colors.muted, fontSize: 10, alignSelf: 'flex-end', marginTop: 2 }}>
                    {new Date(item.created_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                  </Text>
                </View>
              </View>
            );
          }}
        />
      )}

      <View style={[styles.composer, { backgroundColor: colors.card, paddingBottom: insets.bottom + 10 }]}>
        <TextInput
          style={[styles.input, { color: colors.text, backgroundColor: colors.background }]}
          placeholder="Message the group…"
          placeholderTextColor={colors.muted}
          value={text}
          onChangeText={setText}
          multiline
          maxLength={2000}
        />
        <Pressable
          onPress={send}
          disabled={sending || !text.trim()}
          accessibilityLabel="Send"
          style={[styles.send, { backgroundColor: colors.highlight, opacity: sending || !text.trim() ? 0.5 : 1 }]}
        >
          {sending ? <ActivityIndicator color={colors.onHighlight} size="small" /> : <Ionicons name="send" size={18} color={colors.onHighlight} />}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { padding: 14, gap: 6, flexGrow: 1 },
  row: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  bubble: { maxWidth: '78%', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 9 },
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: 10, paddingHorizontal: 12, paddingTop: 10 },
  input: { flex: 1, borderRadius: 22, paddingHorizontal: 16, paddingVertical: 11, fontSize: 15, maxHeight: 120 },
  send: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center' },
});
