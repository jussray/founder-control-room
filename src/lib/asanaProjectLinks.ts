/**
 * Read-only Asana project identities. Asana owns task state; FCR owns release
 * decisions. These IDs identify existing projects and must never create tasks.
 */
export const ASANA_PROJECT_LINKS = Object.freeze({
  "founder-control-room": "1216469762380974",
  "sekret-bip": "1216469910332690",
  "storyengine": "1216469762284114",
  "chief-ai-machine": "1216469873756319",
  "juss-beautiful-hair": "1216469983085420",
  "untold-stories": "1216469873761855",
} as const);

export type AsanaLinkedProject = keyof typeof ASANA_PROJECT_LINKS;

export interface AsanaTaskSnapshot {
  gid: string;
  name: string;
  completed: boolean;
  due_on?: string | null;
  modified_at?: string | null;
}

export interface LinkedAsanaTask {
  source: "asana";
  sourceTaskId: string;
  sourceProjectId: string;
  fcrProjectSlug: AsanaLinkedProject;
  name: string;
  completed: boolean;
  dueOn: string | null;
  observedAt: string;
  sourceModifiedAt: string | null;
  authority: "task-coordination-only";
  releaseAuthorized: false;
}

export function linkAsanaTask(
  slug: AsanaLinkedProject,
  task: AsanaTaskSnapshot,
  observedAt: string,
): LinkedAsanaTask {
  if (!/^[0-9]+$/.test(task.gid) || !task.name.trim()) {
    throw new Error("Invalid Asana task identity");
  }
  if (!Number.isFinite(Date.parse(observedAt))) {
    throw new Error("An observation timestamp is required");
  }
  return {
    source: "asana",
    sourceTaskId: task.gid,
    sourceProjectId: ASANA_PROJECT_LINKS[slug],
    fcrProjectSlug: slug,
    name: task.name,
    completed: task.completed === true,
    dueOn: task.due_on ?? null,
    observedAt,
    sourceModifiedAt: task.modified_at ?? null,
    authority: "task-coordination-only",
    releaseAuthorized: false,
  };
}
