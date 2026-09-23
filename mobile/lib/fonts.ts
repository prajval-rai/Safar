import {
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
  PlusJakartaSans_800ExtraBold,
} from "@expo-google-fonts/plus-jakarta-sans";
import { useFonts } from "expo-font";
import { Text, TextInput } from "react-native";

/** The web app's typeface (`Plus_Jakarta_Sans` in frontend/src/app/layout.tsx),
 *  loaded here so the two apps read as one product.
 *
 *  Deliberately non-blocking: this hook never gates the app's first render —
 *  see the git history on app/_layout.tsx for why (a blocking font load once
 *  left the app on a permanent blank screen when the asset failed to fetch).
 *  Until it resolves, everything just renders in the system font, which is a
 *  perfectly fine fallback, not a broken state. */
export function useAppFont(): boolean {
  const [loaded] = useFonts({
    PlusJakartaSans_400Regular,
    PlusJakartaSans_500Medium,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
    PlusJakartaSans_800ExtraBold,
  });
  return loaded;
}

/** Applies the font to every `Text`/`TextInput` app-wide once it's loaded,
 *  without touching each screen individually. Android renders `fontWeight`
 *  on top of this with a synthetic bold, so existing `fontWeight` styles
 *  throughout the app keep working as they did on the system font. */
export function applyAppFontDefault() {
  const style = { fontFamily: "PlusJakartaSans_400Regular" };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RN's own escape hatch for a global default; no typed API for it.
  const T = Text as any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const I = TextInput as any;
  T.defaultProps = T.defaultProps || {};
  T.defaultProps.style = [style, T.defaultProps.style];
  I.defaultProps = I.defaultProps || {};
  I.defaultProps.style = [style, I.defaultProps.style];
}
