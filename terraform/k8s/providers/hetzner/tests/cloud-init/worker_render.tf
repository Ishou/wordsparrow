# Renders ../../cloud-init/worker.yaml.tftpl with the shared stub variables
# (variables.tf) so worker.tftest.hcl can grep the output for invariants.
# Production rendering happens in ../../server.tf via the same templatefile().

output "worker_rendered" {
  value = templatefile("${path.module}/../../cloud-init/worker.yaml.tftpl", {
    cluster_name  = var.cluster_name
    k3s_version   = var.k3s_version
    k3s_token     = var.k3s_token
    cp_ip         = var.cp_ip
    private_ip    = var.private_ip
    private_iface = var.private_iface
    floating_ip   = var.floating_ip
    node_role     = var.node_role
    node_taints   = var.node_taints
    fip_holder    = var.fip_holder
  })
}
