import Colors, { Theme } from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';

/** The YouTube palette for the current colour scheme. */
export function useTheme(): Theme & { dark: boolean } {
  const scheme = useColorScheme();
  const dark = scheme === 'dark';
  return { ...(dark ? Colors.dark : Colors.light), dark };
}
