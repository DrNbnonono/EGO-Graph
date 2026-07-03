import {join} from "node:path";

export function defaultEgoHome(env: NodeJS.ProcessEnv = process.env): string {
  return env.EGO_HOME ?? join(process.cwd(), ".ego");
}

export function trajectoryDir(egoHome = defaultEgoHome()): string {
  return join(egoHome, "trajectories");
}
