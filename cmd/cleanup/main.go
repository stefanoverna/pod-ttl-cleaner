package main

import (
	"context"
	"fmt"
	"os"
	"strconv"
	"time"

	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/rest"
)

func main() {
	annKey := os.Getenv("ANNOTATION_KEY")
	if annKey == "" {
		fmt.Fprintln(os.Stderr, "FATAL ERROR: ANNOTATION_KEY environment variable not set")
		os.Exit(1)
	}
	now := time.Now().Unix()
	fmt.Printf("START pod-ttl-cleaner run at %s\n", time.Now().Format(time.RFC3339))
	fmt.Printf("Using annotation key=%q\n", annKey)

	config, err := rest.InClusterConfig()
	if err != nil {
		fmt.Fprintln(os.Stderr, "FATAL ERROR: error creating in-cluster config:", err)
		os.Exit(1)
	}
	clientset, err := kubernetes.NewForConfig(config)
	if err != nil {
		fmt.Fprintln(os.Stderr, "FATAL ERROR: error creating Kubernetes client:", err)
		os.Exit(1)
	}

	podDel, podSkip, err := cleanupPods(context.Background(), clientset, annKey, now)
	if err != nil {
		fmt.Fprintln(os.Stderr, "FATAL ERROR: error during pods cleanup:", err)
		os.Exit(1)
	}
	jobDel, jobSkip, err := cleanupJobs(context.Background(), clientset, annKey, now)
	if err != nil {
		fmt.Fprintln(os.Stderr, "FATAL ERROR: error during jobs cleanup:", err)
		os.Exit(1)
	}
	fmt.Printf("\nFINISH pod-ttl-cleaner: pods deleted=%d, pods skipped=%d, jobs deleted=%d, jobs skipped=%d\n",
		podDel, podSkip, jobDel, jobSkip)
}

func cleanupPods(ctx context.Context, clientset *kubernetes.Clientset, annKey string, now int64) (deleted, skipped int, err error) {
	fmt.Println()
	fmt.Println("=== CLEANING UP PODS ===")
	list, err := clientset.CoreV1().Pods("").List(ctx, metav1.ListOptions{})
	if err != nil {
		return 0, 0, err
	}
	pods := list.Items
	fmt.Printf("Found %d pods total\n", len(pods))

	for _, pod := range pods {
		ns := pod.Namespace
		name := pod.Name
		phase := pod.Status.Phase
		if phase != corev1.PodPending && phase != corev1.PodRunning {
			skipped++
			continue
		}
		ttlStr, ok := pod.Annotations[annKey]
		if !ok || pod.CreationTimestamp.IsZero() {
			skipped++
			continue
		}
		ttl, err := strconv.ParseInt(ttlStr, 10, 64)
		if err != nil {
			skipped++
			continue
		}
		age := now - pod.CreationTimestamp.Unix()
		fmt.Printf("- CHECK POD %s/%s: phase=%s, age=%ds, ttl=%ds\n", ns, name, phase, age, ttl)
		if age > ttl {
			fmt.Printf("  → DELETING POD: age %ds > ttl %ds\n", age, ttl)
			if err := clientset.CoreV1().Pods(ns).Delete(ctx, name, metav1.DeleteOptions{}); err != nil {
				fmt.Printf("  !! ERROR deleting pod %s/%s: %v\n", ns, name, err)
			} else {
				deleted++
			}
		} else {
			fmt.Printf("  → KEEP POD: within TTL\n")
			skipped++
		}
	}
	fmt.Printf("PODS: deleted=%d, skipped=%d\n", deleted, skipped)
	return deleted, skipped, nil
}

func cleanupJobs(ctx context.Context, clientset *kubernetes.Clientset, annKey string, now int64) (deleted, skipped int, err error) {
	fmt.Println()
	fmt.Println("=== CLEANING UP JOBS ===")
	list, err := clientset.BatchV1().Jobs("").List(ctx, metav1.ListOptions{})
	if err != nil {
		return 0, 0, err
	}
	jobs := list.Items
	fmt.Printf("Found %d jobs total\n", len(jobs))

	for _, job := range jobs {
		ns := job.Namespace
		name := job.Name
		status := job.Status
		ttlStr, ok := job.Annotations[annKey]
		if !ok || job.CreationTimestamp.IsZero() {
			skipped++
			continue
		}
		ttl, err := strconv.ParseInt(ttlStr, 10, 64)
		if err != nil {
			skipped++
			continue
		}
		age := now - job.CreationTimestamp.Unix()
		isActive := status.Active > 0
		jobState := "Unknown"
		switch {
		case status.Active > 0:
			jobState = "Active"
		case status.Succeeded > 0:
			jobState = "Succeeded"
		case status.Failed > 0:
			jobState = "Failed"
		}
		fmt.Printf("- CHECK JOB %s/%s: state=%s, age=%ds, ttl=%ds, activePods=%d\n",
			ns, name, jobState, age, ttl, status.Active)
		if age > ttl && isActive {
			fmt.Printf("  → DELETING JOB: age %ds > ttl %ds AND has %d active pods\n",
				age, ttl, status.Active)
			prop := metav1.DeletePropagationBackground
			if err := clientset.BatchV1().Jobs(ns).Delete(ctx, name, metav1.DeleteOptions{PropagationPolicy: &prop}); err != nil {
				fmt.Printf("  !! ERROR deleting job %s/%s: %v\n", ns, name, err)
			} else {
				deleted++
			}
		} else {
			reason := "within TTL"
			if age > ttl {
				reason = "no active pods"
			}
			fmt.Printf("  → KEEP JOB: %s\n", reason)
			skipped++
		}
	}
	fmt.Printf("JOBS: deleted=%d, skipped=%d\n", deleted, skipped)
	return deleted, skipped, nil
}
