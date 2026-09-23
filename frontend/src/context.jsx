import React, { createContext, useContext, useState } from 'react';
import { getSession, clearSession } from './api';

const AppCtx = createContext(null);

export function AppProvider({ children }) {
  const [session, setSession] = useState(getSession());

  const login = (data) => {
    saveSessionToStorage(data);
    setSession(data);
  };
  const logout = () => {
    clearSession();
    setSession(null);
  };

  return <AppCtx.Provider value={{ session, login, logout }}>{children}</AppCtx.Provider>;
}

function saveSessionToStorage(data) {
  localStorage.setItem('hunar_session', JSON.stringify(data));
}

export const useApp = () => useContext(AppCtx);
