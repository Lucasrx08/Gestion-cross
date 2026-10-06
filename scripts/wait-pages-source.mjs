// A repository still configured for branch Pages also starts a Jekyll deployment.
// Publish our compiled application after that deployment, so it cannot overwrite it.
const { GITHUB_REPOSITORY, GITHUB_SHA, GITHUB_RUN_ID, GH_TOKEN } = process.env;
if (!GITHUB_REPOSITORY || !GITHUB_SHA || !GITHUB_RUN_ID || !GH_TOKEN)
  throw new Error("Contexte GitHub Actions incomplet.");
const deadline = Date.now() + 12 * 60_000;
while (true) {
  const response = await fetch(`https://api.github.com/repos/${GITHUB_REPOSITORY}/actions/runs?head_sha=${GITHUB_SHA}&per_page=100`, {
    headers: { Authorization: `Bearer ${GH_TOKEN}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`Lecture des publications GitHub impossible (${response.status}).`);
  const data = await response.json();
  const legacy = data.workflow_runs.filter(run => String(run.id) !== GITHUB_RUN_ID && run.path === "dynamic/pages/pages-build-deployment");
  if (legacy.every(run => run.status === "completed")) {
    console.log(legacy.length ? "Publication automatique de branche terminée ; l’application peut être publiée en dernier." : "Aucune publication automatique de branche concurrente.");
    break;
  }
  if (Date.now() >= deadline) throw new Error("La publication automatique de branche n’est pas terminée. Publication de l’application interrompue pour éviter un conflit.");
  console.log("Attente de la publication automatique de branche avant celle de l’application…");
  await new Promise(resolve => setTimeout(resolve, 20_000));
}
