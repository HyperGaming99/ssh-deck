import { useEffect, useState } from 'react';
import { inV } from '@/context/VaultContext';
import K8sTab from '@/components/K8sTab';

export function K8sView({ dark, connect, toast, vault, rev }) {
  const [hosts, setHosts] = useState([]);
  useEffect(() => {
    api.hosts.list().then((l) => setHosts(vault ? l.filter((h) => inV(h, vault)) : l)).catch(() => {});
  }, [vault, rev]);
  return <K8sTab hosts={hosts} connect={connect} toast={toast} dark={dark} />;
}

export default K8sView;
