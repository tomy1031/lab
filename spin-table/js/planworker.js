// js/planworker.js — runs the planner off the main thread (module worker), so solving a shot never drops a VR frame.
import { runJob } from './planner.js';

self.onmessage = (e) => {
  const { id, job } = e.data;
  self.postMessage({ id, res: runJob(job) });
};
