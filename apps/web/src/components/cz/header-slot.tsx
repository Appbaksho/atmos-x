'use client';
/**
 * Lets the app shell put its account menu into every tab-root header (`ScreenHeader big`) without
 * the kit importing data hooks. Outside the shell (kit gallery, auth pages) the slot is empty.
 */
import { createContext, useContext, type ReactNode } from 'react';

export const HeaderMenuSlot = createContext<ReactNode>(null);

export function useHeaderMenu(): ReactNode {
  return useContext(HeaderMenuSlot);
}
