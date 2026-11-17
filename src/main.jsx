import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './styles.css';

class AppErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { failed: false, message: '' }; }
  static getDerivedStateFromError(error) { return { failed: true, message: error?.message || 'Erro de renderização não identificado.' }; }
  componentDidCatch(error) { console.error('Courtside render error:', error); }
  render() {
    if (this.state.failed) return <main className="app-crash"><section><span>COURTSIDE FAMILY</span><h1>Não foi possível abrir esta tela</h1><p>Ocorreu um erro inesperado na interface. Seus dados salvos continuam preservados. Tente recarregar o aplicativo.</p><details><summary>Detalhes técnicos para suporte</summary><pre>{this.state.message}</pre></details><button onClick={() => window.location.reload()}>Recarregar aplicativo</button></section></main>;
    return this.props.children;
  }
}

if ('serviceWorker' in navigator) window.addEventListener('load',()=>{let reloading=false;navigator.serviceWorker.register('/sw.js').then(reg=>{reg.update().catch(()=>{});window.setInterval(()=>{if(document.visibilityState==='visible')reg.update().catch(()=>{});},60000);document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')reg.update().catch(()=>{});});}).catch(()=>{});navigator.serviceWorker.addEventListener('controllerchange',()=>{if(!reloading){reloading=true;window.location.reload();}});});
createRoot(document.getElementById('root')).render(<React.StrictMode><AppErrorBoundary><App/></AppErrorBoundary></React.StrictMode>);
