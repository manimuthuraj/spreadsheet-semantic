import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { ChakraProvider, extendTheme } from '@chakra-ui/react';
import App from './App.tsx'

const theme = extendTheme({
  colors: {
    superjoin: {
      500: '#F15A24',
      600: '#E04A1B',
    },
  },
  styles: {
    global: {
      body: {
        bg: 'gray.100',
      },
    },
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ChakraProvider theme={theme}>
      <App />
    </ChakraProvider>
  </StrictMode>,
)


