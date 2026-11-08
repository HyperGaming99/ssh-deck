import { useEffect, useState } from 'react';
import { inV } from '@/context/VaultContext';
import DockerTab from '@/components/DockerTab';

export function DockerView({ dark, connect, toast, vault, rev }) {
  const [hosts, setHosts] = useState([]);
  useEffect(() => {
    api.hosts.list().then((l) => setHosts(vault ? l.filter((h) => inV(h, vault)) : l)).catch(() => {});
  }, [vault, rev]);
  return <DockerTab hosts={hosts} connect={connect} toast={toast} dark={dark} />;
}

export default DockerView;
