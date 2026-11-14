import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './styles.css';
if ('serviceWorker' in navigator) window.addEventListener('load',()=>{let reloading=false;navigator.serviceWorker.register('/sw.js').then(reg=>{reg.update().catch(()=>{});window.setInterval(()=>{if(document.visibilityState==='visible')reg.update().catch(()=>{});},60000);document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')reg.update().catch(()=>{});});}).catch(()=>{});navigator.serviceWorker.addEventListener('controllerchange',()=>{if(!reloading){reloading=true;window.location.reload();}});});
createRoot(document.getElementById('root')).render(<React.StrictMode><App/></React.StrictMode>);
