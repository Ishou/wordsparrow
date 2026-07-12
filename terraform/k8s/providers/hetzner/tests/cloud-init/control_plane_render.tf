# Test fixture: renders control-plane.yaml.tftpl with stub variables for control-plane.tftest.hcl; mirrors worker_render.tf. No resources, never `tofu apply`.

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
  # Not marked sensitive: test-only, and assertions need to read the rendered body. Production passes a sensitive value (server.tf).
  type    = string
  default = "stub-token"
}

variable "tls_san" {
  type    = string
  default = "test-cluster-cp-0"
}

variable "private_ip" {
  type    = string
  default = "10.0.1.10"
}

variable "private_iface" {
  type    = string
  default = "enp7s0"
}

variable "floating_ip" {
  type    = string
  default = "203.0.113.42"
}

output "control_plane_rendered" {
  value = templatefile("${path.module}/../../cloud-init/control-plane.yaml.tftpl", {
    cluster_name  = var.cluster_name
    k3s_version   = var.k3s_version
    k3s_token     = var.k3s_token
    tls_san       = var.tls_san
    private_ip    = var.private_ip
    private_iface = var.private_iface
    floating_ip   = var.floating_ip
  })
}
