#!/usr/bin/env node

import { CoreV1Api, KubeConfig } from "@kubernetes/client-node";

const kc = new KubeConfig();
kc.loadFromCluster();
const core = kc.makeApiClient(CoreV1Api);

const annKey = process.env.ANNOTATION_KEY!;
const nowUnix = Date.now() / 1000;

console.log(`START pod-ttl-cleaner run at ${new Date().toISOString()}`);
console.log(`Using annotation key="${annKey}"`);

async function main() {
  const res = await core.listPodForAllNamespaces();
  const pods = res.items;
  console.log(`Found ${pods.length} pods total`);

  let deletedCount = 0;
  let skippedCount = 0;

  for (const pod of pods) {
    const meta = pod.metadata || {};
    const ns = meta.namespace;
    const name = meta.name;
    const phase = pod.status?.phase;
    const annotations = meta.annotations || {};
    const ttl = annotations[annKey] ? parseInt(annotations[annKey], 10) : undefined;
    const createdUnix = meta.creationTimestamp ? meta.creationTimestamp.getTime() / 1000 : undefined;
    const age = createdUnix ? Math.floor(nowUnix - createdUnix) : undefined;

    if (!ns || !name) {
      throw new Error('This should not happen');
    }

    if (!phase || !["Pending", "Running"].includes(phase)) {
      skippedCount++;
      continue;
    }

    if (ttl === undefined || age === undefined) {
      skippedCount++;
      continue;
    }

    console.log(
      `- CHECK ${ns}/${name}: phase=${phase}, age=${age}s, ttl=${ttl}s`
    );

    if (age > ttl) {
      console.log(`  → DELETING ${ns}/${name} (age ${age}s > ttl ${ttl}s)`);
      try {
        await core.deleteNamespacedPod({ name, namespace: ns });
        deletedCount++;
      } catch (err) {
        console.error(`  !! ERROR deleting ${ns}/${name}:`, err.body || err);
      }
    } else {
      console.log(`  → KEEP ${ns}/${name} (within TTL)`);
      skippedCount++;
    }
  }

  console.log(
    `FINISH pod-ttl-cleaner: deleted=${deletedCount}, skipped=${skippedCount}`
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("FATAL ERROR:", err);
    process.exit(1);
  });
