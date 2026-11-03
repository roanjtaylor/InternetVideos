/**
 * YouTube's mobile palette. Red is reserved for the brand mark, the loading
 * bar and the playback progress; everything else is black, white and grey.
 */
export const RED = '#ff0000';

const light = {
  text: '#0f0f0f',
  secondary: '#606060',
  background: '#ffffff',
  surface: '#f2f2f2', // chips, inputs, cards
  surfaceHigh: '#e5e5e5', // pressed chips, skeleton blocks
  divider: 'rgba(0, 0, 0, 0.1)',
  link: '#065fd4',
  red: RED,
  danger: '#cc0000',
  tint: '#0f0f0f',
  tabIconDefault: '#0f0f0f',
  tabIconSelected: '#0f0f0f',
  skeleton: '#e5e5e5',
  // Quota chart slices (validated for light surfaces).
  chart: { search: '#ff0000', writes: '#065fd4', reads: '#e6a100', remaining: '#e5e5e5' },
};

const dark: typeof light = {
  text: '#f1f1f1',
  secondary: '#aaaaaa',
  background: '#0f0f0f',
  surface: '#272727',
  surfaceHigh: '#3f3f3f',
  divider: 'rgba(255, 255, 255, 0.1)',
  link: '#3ea6ff',
  red: RED,
  danger: '#ff4e45',
  tint: '#f1f1f1',
  tabIconDefault: '#f1f1f1',
  tabIconSelected: '#f1f1f1',
  skeleton: '#272727',
  chart: { search: '#ff3d3d', writes: '#2f8ae6', reads: '#b07a00', remaining: '#3f3f3f' },
};

export type Theme = typeof light;

export default { light, dark };
