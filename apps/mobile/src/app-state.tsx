import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { getWorkspace, type Workspace } from "./db/repo";
import { supabase } from "./supabase";
import { reportError } from "./telemetry";

interface AppState {
  ready: boolean;
  session: Session | null;
  workspace: Workspace | null;
  reload: () => Promise<void>;
}

const Ctx = createContext<AppState>({ ready: false, session: null, workspace: null, reload: async () => {} });

export function AppProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [workspace, setWorkspace] = useState<Workspace | null>(null);

  const reload = useCallback(async () => {
    try {
      setWorkspace(await getWorkspace());
    } catch (e) {
      reportError(e, "load workspace");
    }
  }, []);

  useEffect(() => {
    let unsub: (() => void) | undefined;
    (async () => {
      if (supabase) {
        const { data } = await supabase.auth.getSession();
        setSession(data.session);
        unsub = supabase.auth.onAuthStateChange((_e, s) => setSession(s)).data.subscription.unsubscribe;
      }
      await reload();
      setReady(true);
    })().catch((e) => {
      reportError(e, "boot");
      setReady(true);
    });
    return () => unsub?.();
  }, [reload]);

  return <Ctx.Provider value={{ ready, session, workspace, reload }}>{children}</Ctx.Provider>;
}

export const useApp = () => useContext(Ctx);
