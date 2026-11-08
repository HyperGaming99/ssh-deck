import { useEffect, useState } from 'react';
import K8sTab from '@/components/K8sTab';

export function K8sView({ dark, connect, toast }) {
  const [hosts, setHosts] = useState([]);
  useEffect(() => {
    api.hosts.list().then(setHosts).catch(() => {});
  }, []);
  return <K8sTab hosts={hosts} connect={connect} toast={toast} dark={dark} />;
}

export default K8sView;
