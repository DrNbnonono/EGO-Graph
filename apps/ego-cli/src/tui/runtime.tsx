/** @jsxImportSource @opentui/solid */
import type { PermissionLevel, TerminalAgentSession } from "@ego-graph/agent-harness";
import type { WorkbenchState } from "@ego-graph/workbench";
import { createContext, useContext, type Accessor, type JSX } from "solid-js";

export type TuiRuntimeContext = {
  cwd: string;
  session: TerminalAgentSession;
  workbench: Accessor<WorkbenchState | undefined>;
  permissionLevel: Accessor<PermissionLevel>;
};

const RuntimeContext = createContext<TuiRuntimeContext>();

export function TuiRuntimeProvider(props: TuiRuntimeContext & { children: JSX.Element }): JSX.Element {
  return (
    <RuntimeContext.Provider
      value={{
        cwd: props.cwd,
        session: props.session,
        workbench: props.workbench,
        permissionLevel: props.permissionLevel,
      }}
    >
      {props.children}
    </RuntimeContext.Provider>
  );
}

export function useTuiRuntime(): TuiRuntimeContext {
  const value = useContext(RuntimeContext);
  if (!value) {
    throw new Error("TuiRuntimeProvider is missing");
  }
  return value;
}
