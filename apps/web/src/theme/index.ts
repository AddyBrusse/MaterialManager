import { createTheme, MantineColorsTuple } from '@mantine/core'

const blue: MantineColorsTuple = [
  '#e7effd', '#cce0fb', '#99c1f7', '#66a2f3', '#3383f0',
  '#2d6df6', '#2560e0', '#1d50c4', '#1640a8', '#0f308c',
]

export const theme = createTheme({
  colors: { blue },
  primaryColor: 'blue',
  fontFamily: '"IBM Plex Sans", -apple-system, system-ui, sans-serif',
  fontFamilyMonospace: '"IBM Plex Mono", ui-monospace, "SF Mono", monospace',
  defaultRadius: 'sm',
  // Mantine components only used for complex UI (forms, drawers, notifications)
  // Page layout/tables use tokens.css directly
  components: {
    TextInput: { defaultProps: { size: 'xs' } },
    NumberInput: { defaultProps: { size: 'xs' } },
    Select: { defaultProps: { size: 'xs' } },
    Textarea: { defaultProps: { size: 'xs' } },
    Drawer: { defaultProps: { size: 'md' } },
    Badge: { defaultProps: { size: 'xs' } },
    Loader: { defaultProps: { size: 'sm' } },
  },
})
