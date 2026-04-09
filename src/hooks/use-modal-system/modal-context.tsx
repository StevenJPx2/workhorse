/**
 * Modal System Context Provider
 *
 * Provides global modal state management through React context.
 * Components can open/close modals by name from anywhere in the tree.
 */

import {
  createContext,
  useContext,
  createSignal,
  type JSX,
} from "solid-js";
import type {
  ModalName,
  ModalDataMap,
  ModalSystemState,
  UseModalSystemReturn,
} from "./types.ts";

/**
 * Initial state with all modals closed
 */
const initialState: ModalSystemState = {
  "ticket-input": { isOpen: false, data: undefined },
  help: { isOpen: false, data: undefined },
  confirm: { isOpen: false, data: undefined },
};

const ModalSystemContext = createContext<UseModalSystemReturn>();

/**
 * Props for the ModalSystemProvider component
 */
export interface ModalSystemProviderProps {
  children: JSX.Element;
}

/**
 * Provider component for the global modal system
 */
export function ModalSystemProvider(props: ModalSystemProviderProps) {
  const [state, setState] = createSignal<ModalSystemState>(initialState);

  const isOpen = <K extends ModalName>(name: K): boolean => {
    return state()[name].isOpen;
  };

  const getData = <K extends ModalName>(name: K): ModalDataMap[K] | undefined => {
    return state()[name].data as ModalDataMap[K] | undefined;
  };

  const open = <K extends ModalName>(
    name: K,
    ...args: ModalDataMap[K] extends undefined ? [] : [ModalDataMap[K]]
  ): void => {
    const data = args[0] as ModalDataMap[K] | undefined;
    setState((prev) => ({
      ...prev,
      [name]: { isOpen: true, data },
    }));
  };

  const close = (name: ModalName): void => {
    setState((prev) => ({
      ...prev,
      [name]: { isOpen: false, data: undefined },
    }));
  };

  const closeAll = (): void => {
    setState(initialState);
  };

  const toggle = <K extends ModalName>(
    name: K,
    ...args: ModalDataMap[K] extends undefined ? [] : [ModalDataMap[K]]
  ): void => {
    if (isOpen(name)) {
      close(name);
    } else {
      open(name, ...args);
    }
  };

  const hasOpenModal = () => {
    const s = state();
    return Object.values(s).some((modal) => modal.isOpen);
  };

  const contextValue: UseModalSystemReturn = {
    isOpen,
    getData,
    open,
    close,
    closeAll,
    toggle,
    hasOpenModal,
  };

  return (
    <ModalSystemContext.Provider value={contextValue}>
      {props.children}
    </ModalSystemContext.Provider>
  );
}

/**
 * Hook to consume the modal system context
 *
 * @throws Error if used outside of ModalSystemProvider
 */
export function useModalSystem(): UseModalSystemReturn {
  const context = useContext(ModalSystemContext);
  if (!context) {
    throw new Error("useModalSystem must be used within a ModalSystemProvider");
  }
  return context;
}
