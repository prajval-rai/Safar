import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { Avatar, Photo, usePalette } from '@/components/ui';
import { ApiError, apiUpload, mediaUrl } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { relativeTime } from '@/lib/format';
import type { Memory, XPResult } from '@/lib/types';
import { useFetch } from '@/lib/useFetch';

/** The trip's shared album: everyone's photos in a grid, an Add photo button
 *  (gallery or camera), and a full-screen view with who added it. */
export function TripPhotos({ tripId, canAdd }: { tripId: string; canAdd: boolean }) {
  const colors = usePalette();
  const { refreshUser } = useAuth();
  const { data, loading, error, refresh } = useFetch<Memory[]>(`/api/trips/${tripId}/memories/`);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<Memory | null>(null);

  async function add(source: 'library' | 'camera') {
    const permission =
      source === 'camera'
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission needed', `Allow access to your ${source === 'camera' ? 'camera' : 'photos'} in Settings to add one.`);
      return;
    }
    const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.8, exif: false };
    const result =
      source === 'camera' ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
    if (result.canceled || !result.assets.length) return;

    const asset = result.assets[0];
    const form = new FormData();
    const name = asset.fileName || `photo-${Date.now()}.jpg`;
    // React Native's FormData takes a {uri, name, type} object for a file.
    form.append('image', { uri: asset.uri, name, type: asset.mimeType || 'image/jpeg' } as unknown as Blob);
    setBusy(true);
    try {
      const saved = await apiUpload<XPResult & { duplicate_photo?: boolean; note?: string }>(
        `/api/trips/${tripId}/memories/`,
        form,
      );
      await refresh();
      refreshUser();
      const xp = saved.xp_awarded ? `+${saved.xp_awarded} XP` : '';
      const why = saved.duplicate_photo ? 'This photo was shared before, so no XP.' : saved.note || '';
      if (xp || why) Alert.alert('Photo added', [xp, why].filter(Boolean).join('\n'));
    } catch (e) {
      Alert.alert("Couldn't add that photo", e instanceof ApiError ? e.message : 'Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  }

  function choose() {
    Alert.alert('Add a photo', undefined, [
      { text: 'Take a photo', onPress: () => add('camera') },
      { text: 'Choose from gallery', onPress: () => add('library') },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }

  const photos = (data ?? []).filter((m) => m.image || m.image_url);

  return (
    <View>
      {canAdd ? (
        <Pressable
          onPress={choose}
          disabled={busy}
          style={[styles.add, { backgroundColor: colors.highlight, opacity: busy ? 0.6 : 1 }]}
        >
          {busy ? (
            <ActivityIndicator color={colors.onHighlight} />
          ) : (
            <>
              <Ionicons name="camera-outline" size={19} color={colors.onHighlight} />
              <Text style={{ color: colors.onHighlight, fontWeight: '800', fontSize: 15 }}>Add photo</Text>
            </>
          )}
        </Pressable>
      ) : null}

      {loading && !data ? (
        <ActivityIndicator style={{ marginTop: 24 }} />
      ) : error && !data ? (
        <Pressable onPress={refresh}>
          <Text style={[styles.note, { color: colors.danger }]}>{error} Tap to retry.</Text>
        </Pressable>
      ) : photos.length ? (
        <View style={styles.grid}>
          {photos.map((m) => (
            <Pressable key={m.id} onPress={() => setOpen(m)} style={styles.cell}>
              <Photo uri={mediaUrl(m.image) ?? m.image_url} style={StyleSheet.absoluteFill} radius={16} />
            </Pressable>
          ))}
        </View>
      ) : (
        <Text style={[styles.note, { color: colors.muted }]}>
          No photos yet. The first one becomes the trip&apos;s cover.
        </Text>
      )}

      <Modal visible={Boolean(open)} transparent animationType="fade" onRequestClose={() => setOpen(null)}>
        <Pressable style={styles.viewer} onPress={() => setOpen(null)}>
          {open ? (
            <>
              <Photo uri={mediaUrl(open.image) ?? open.image_url} style={styles.full} radius={18} />
              <View style={styles.byline}>
                <Avatar emoji={open.user.avatar_emoji} size={34} />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: '#fff', fontWeight: '700' }}>{open.user.name}</Text>
                  <Text style={{ color: '#ccc', fontSize: 12 }}>{relativeTime(open.created_at)}</Text>
                </View>
              </View>
              {open.caption ? <Text style={styles.caption}>{open.caption}</Text> : null}
            </>
          ) : null}
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  add: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 999,
    paddingVertical: 14,
    marginBottom: 14,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  cell: { width: '31.9%', aspectRatio: 1, borderRadius: 16, overflow: 'hidden' },
  note: { fontSize: 14, textAlign: 'center', marginTop: 20, lineHeight: 20 },
  viewer: { flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', justifyContent: 'center', padding: 16 },
  full: { width: '100%', aspectRatio: 3 / 4 },
  byline: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 14 },
  caption: { color: '#eee', fontSize: 14, marginTop: 10, lineHeight: 20 },
});
