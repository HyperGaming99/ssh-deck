import { createContext, useContext } from 'react';

// Tresor: "personal" oder die id eines Teams. Alle Listen zeigen nur den gewählten Tresor, neue Einträge landen darin.
export const VaultCtx = createContext({ vault: 'personal', name: '', role: 'owner', writable: true, vaults: [] });

export const useVault = () => useContext(VaultCtx);

export const inV = (r, vault) => (r?.vault || 'personal') === vault;
