import {access, mkdir} from "node:fs/promises";
import {defaultEgoHome, trajectoryDir} from "@ego-graph/storage";

export async function handleDoctorCommand(): Promise<void> {
  const egoHome = defaultEgoHome();
  const trajectories = trajectoryDir(egoHome);
  await mkdir(trajectories, {recursive: true});
  await access(trajectories);

  console.log(`Node.js ${process.version}`);
  console.log(`EGO_HOME ${egoHome}`);
  console.log(`Trajectory storage ${trajectories}`);
  console.log("EGO-Graph doctor complete");
}
