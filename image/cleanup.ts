#!/usr/bin/env node

import { BatchV1Api, CoreV1Api, KubeConfig } from "@kubernetes/client-node";

const kc = new KubeConfig();
kc.loadFromCluster();
const core = kc.makeApiClient(CoreV1Api);
const batch = kc.makeApiClient(BatchV1Api);

const annKey = process.env.ANNOTATION_KEY!;
const nowUnix = Date.now() / 1000;

console.log(`START pod-job-ttl-cleaner run at ${new Date().toISOString()}`);
console.log(`Using annotation key="${annKey}"`);

async function cleanupPods() {
  console.log('\n=== CLEANING UP PODS ===');
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
      `- CHECK POD ${ns}/${name}: phase=${phase}, age=${age}s, ttl=${ttl}s`
    );

    if (age > ttl) {
      console.log(`  → DELETING POD ${ns}/${name} (age ${age}s > ttl ${ttl}s)`);
      try {
        await core.deleteNamespacedPod({ name, namespace: ns });
        deletedCount++;
      } catch (err) {
        console.error(`  !! ERROR deleting pod ${ns}/${name}:`, err.body || err);
      }
    } else {
      console.log(`  → KEEP POD ${ns}/${name} (within TTL)`);
      skippedCount++;
    }
  }

  console.log(`PODS: deleted=${deletedCount}, skipped=${skippedCount}`);
  return { deletedCount, skippedCount };
}

async function cleanupJobs() {
  console.log('\n=== CLEANING UP JOBS ===');
  const res = await batch.listJobForAllNamespaces();
  const jobs = res.items;
  console.log(`Found ${jobs.length} jobs total`);

  let deletedCount = 0;
  let skippedCount = 0;

  for (const job of jobs) {
    const meta = job.metadata || {};
    const ns = meta.namespace;
    const name = meta.name;
    const status = job.status;
    const annotations = meta.annotations || {};
    const ttl = annotations[annKey] ? parseInt(annotations[annKey], 10) : undefined;
    const createdUnix = meta.creationTimestamp ? meta.creationTimestamp.getTime() / 1000 : undefined;
    const age = createdUnix ? Math.floor(nowUnix - createdUnix) : undefined;

    if (!ns || !name) {
      throw new Error('This should not happen');
    }

    if (ttl === undefined || age === undefined) {
      skippedCount++;
      continue;
    }

    // Check job state for logging purposes
    const isActive = status?.active && status.active > 0;
    const jobState = isActive ? 'Active' :
      status?.succeeded ? 'Succeeded' :
        status?.failed ? 'Failed' : 'Unknown';

    console.log(
      `- CHECK JOB ${ns}/${name}: state=${jobState}, age=${age}s, ttl=${ttl}s`
    );

    if (age > ttl) {
      console.log(`  → DELETING JOB ${ns}/${name} (age ${age}s > ttl ${ttl}s)`);
      try {
        // Delete job with cascade policy to also delete associated pods
        await batch.deleteNamespacedJob({
          name,
          namespace: ns,
          propagationPolicy: 'Background'
        });
        deletedCount++;
      } catch (err) {
        console.error(`  !! ERROR deleting job ${ns}/${name}:`, err.body || err);
      }
    } else {
      console.log(`  → KEEP JOB ${ns}/${name} (within TTL)`);
      skippedCount++;
    }
  }

  console.log(`JOBS: deleted=${deletedCount}, skipped=${skippedCount}`);
  return { deletedCount, skippedCount };
}

async function main() {
  const podResults = await cleanupPods();
  const jobResults = await cleanupJobs();

  console.log(
    `\nFINISH pod-ttl-cleaner: ` +
    `pods deleted=${podResults.deletedCount}, pods skipped=${podResults.skippedCount}, ` +
    `jobs deleted=${jobResults.deletedCount}, jobs skipped=${jobResults.skippedCount}`
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("FATAL ERROR:", err);
    process.exit(1);
  });