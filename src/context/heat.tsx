import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';

import { useLocation } from './location';
import { analyzeGrid, HeatAnalysis } from '@/lib/heat';
import { AirSummary, fetchAirSummary, fetchLstGrid, LstGrid } from '@/lib/nasa';

type HeatState = {
  radiusKm: number;
  setRadiusKm: (r: number) => void;
  grid: LstGrid | null;
  analysis: HeatAnalysis | null;
  air: AirSummary | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
};

type Result = { key: string; grid: LstGrid | null; analysis: HeatAnalysis | null; error: string | null };

const Ctx = createContext<HeatState | null>(null);

export function HeatProvider({ children }: { children: React.ReactNode }) {
  const { focus, device } = useLocation();
  const [radiusKm, setRadiusKm] = useState(5);
  const [nonce, setNonce] = useState(0);
  const [result, setResult] = useState<Result | null>(null);
  const [air, setAir] = useState<AirSummary | null>(null);

  const key = `${focus.latitude},${focus.longitude},${radiusKm},${device.latitude},${device.longitude},${nonce}`;

  useEffect(() => {
    let alive = true;
    fetchLstGrid(focus, radiusKm)
      .then((g) => alive && setResult({ key, grid: g, analysis: analyzeGrid(g, device), error: null }))
      .catch((e) => alive && setResult((r) => ({ key, grid: r?.grid ?? null, analysis: r?.analysis ?? null, error: e?.message ?? 'Could not load NASA data' })));
    fetchAirSummary(focus)
      .then((a) => alive && setAir(a))
      .catch(() => alive && setAir(null));
    return () => {
      alive = false;
    };
  }, [key, focus, radiusKm, device]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  const loading = result?.key !== key;

  return (
    <Ctx.Provider
      value={{
        radiusKm,
        setRadiusKm,
        grid: result?.grid ?? null,
        analysis: result?.analysis ?? null,
        air,
        loading,
        error: loading ? null : result?.error ?? null,
        reload,
      }}>
      {children}
    </Ctx.Provider>
  );
}

export function useHeat() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useHeat must be used inside HeatProvider');
  return v;
}
