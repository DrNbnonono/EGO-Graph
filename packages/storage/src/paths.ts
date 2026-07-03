import {join} from "node:path";

export function defaultEgoHome(env: NodeJS.ProcessEnv = process.env): string {
  return env.EGO_HOME ?? join(process.cwd(), ".ego");
}

export function trajectoryDir(egoHome = defaultEgoHome()): string {
  return join(egoHome, "trajectories");
}

export function reportDir(egoHome = defaultEgoHome()): string {
  return join(egoHome, "reports");
}

export function artifactDir(egoHome = defaultEgoHome()): string {
  return join(egoHome, "artifacts");
}

export function sqlitePath(egoHome = defaultEgoHome()): string {
  return join(egoHome, "ego.sqlite");
}
