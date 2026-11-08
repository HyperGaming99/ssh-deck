import { useEffect, useState } from 'react';
import DockerTab from '@/components/DockerTab';

export function DockerView({ dark, connect, toast }) {
  const [hosts, setHosts] = useState([]);
  useEffect(() => {
    api.hosts.list().then(setHosts).catch(() => {});
  }, []);
  return <DockerTab hosts={hosts} connect={connect} toast={toast} dark={dark} />;
}

export default DockerView;
