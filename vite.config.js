import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({
  plugins:[react],
  server:{host:'0.0.0.0',proxy:{'/api':'http://localhost:10000'}},
  build:{
    outDir:'dist',
    rollupOptions:{
      output:{
        manualChunks(id){
          if(!id.includes('node_modules'))return;
          if(id.includes('/react/')||id.includes('/react-dom/')||id.includes('/scheduler/'))return 'react-vendor';
          if(id.includes('/lucide-react/'))return 'icons';
          if(id.includes('/@supabase/')||id.includes('/@supabase'))return 'supabase';
        }
      }
    }
  }
});
