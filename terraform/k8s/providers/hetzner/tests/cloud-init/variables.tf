# Shared stub variables for the cloud-init render fixtures (worker_render.tf, control_plane_render.tf) — declared once here since both fixtures live in one module; each keeps only its own `output`. No resources, never `tofu apply`.

terraform {
  required_version = "~> 1.10"
}

variable "cluster_name" {
  type    = string
  default = "test-cluster"
}

variable "k3s_version" {
  type    = string
  default = "v1.35.3+k3s1"
}

variable "k3s_token" {
  # Not marked sensitive: test-only, and assertions read the rendered body (server.tf passes a sensitive value in production).
  type    = string
  default = "stub-token"
}

variable "cp_ip" {
  type    = string
  default = "10.0.1.10"
}

variable "private_ip" {
  type    = string
  default = "10.0.1.20"
}

variable "private_iface" {
  type    = string
  default = "enp7s0"
}

variable "floating_ip" {
  type    = string
  default = "203.0.113.42"
}

variable "node_role" {
  type    = string
  default = "worker"
}

variable "node_taints" {
  type    = list(string)
  default = []
}

variable "fip_holder" {
  type    = bool
  default = false
}

variable "tls_san" {
  type    = string
  default = "test-cluster-cp-0"
}
