# Renders control-plane.yaml.tftpl with the shared stub variables (variables.tf)
# for control-plane.tftest.hcl; mirrors worker_render.tf. No resources.

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
