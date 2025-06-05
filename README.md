# Pod TTL Cleaner

**A Kubernetes CronJob to garbage-collect pods and jobs past their TTL annotation**

## Overview

`pod-ttl-cleaner` scans all pods and jobs in the cluster at a configurable interval and deletes those whose age (in seconds) exceeds a TTL value specified via an annotation.

## Installation

This project includes a Helm chart for easy installation:

```bash
helm upgrade --install pod-ttl-cleaner . \
  --set schedule="* * * * *" \
  --set annotationKey="stefanoverna.github.io/pod-ttl-cleaner.ttl" \
  --set image.repository=ghcr.io/stefanoverna/pod-ttl-cleaner \
  --set image.tag=1.0.0
```

Default values are defined in `values.yaml`.

## Configuration

| Parameter          | Description                                      | Default                                                      |
|--------------------|--------------------------------------------------|--------------------------------------------------------------|
| `schedule`         | Cron schedule for cleanup job                    | `* * * * *`                                                  |
| `annotationKey`    | Annotation key (in seconds) for TTL on pods/jobs | `stefanoverna.github.io/pod-ttl-cleaner.ttl`                 |
| `image.repository` | Container image repository                       | `ghcr.io/stefanoverna/pod-ttl-cleaner`                       |
| `image.tag`        | Container image tag                              | `1.0.0`                                                      |

## Building Locally

```bash
git clone https://github.com/stefanoverna/pod-ttl-cleaner.git
cd pod-ttl-cleaner

# Ensure module dependencies are tidy
go mod tidy

# Build the binary
go build -o pod-ttl-cleaner cmd/cleanup/main.go

# Build the container image
docker build -t ghcr.io/stefanoverna/pod-ttl-cleaner:latest .
```

## Environment Variables

The container honors the following environment variable:

| Name             | Description                              |
|------------------|------------------------------------------|
| `ANNOTATION_KEY` | Annotation key for discovering TTL (sec) |

## Usage

The CronJob will log the number of pods and jobs checked, skipped, and deleted on each run.

## Testing

You can test the cleanup logic against a live Kubernetes cluster (e.g. Kind):

1. Create a local Kind cluster:
   ```bash
   kind create cluster
   ```
2. Build the binary and Docker image, then load it into the cluster:
   ```bash
   go build -o pod-ttl-cleaner cmd/cleanup/main.go
   docker build -t pod-ttl-cleaner:latest .
   kind load docker-image pod-ttl-cleaner:latest
   ```
3. Deploy the Helm chart using the local image:
   ```bash
   helm upgrade --install pod-ttl-cleaner . \
     --set image.repository=pod-ttl-cleaner \
     --set image.tag=latest \
     --set schedule="*/10 * * * *" \
     --set annotationKey="stefanoverna.github.io/pod-ttl-cleaner.ttl"
   ```
4. Create a test namespace and a pod with a short TTL annotation:
   ```bash
   kubectl create ns test-ptc
   cat <<EOF | kubectl apply -n test-ptc -f -
   apiVersion: v1
   kind: Pod
   metadata:
     name: expired-test
     annotations:
       stefanoverna.github.io/pod-ttl-cleaner.ttl: "5"
   spec:
     containers:
     - name: pause
       image: k8s.gcr.io/pause
   EOF
   ```
5. Wait at least 5 seconds and observe the pod deletion:
   ```bash
   kubectl get pods -n test-ptc --watch
   ```

## License

This project is released under the MIT License.