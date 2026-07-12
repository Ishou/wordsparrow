# Control plane goes through the same hcloud_server -> hcloud_server_network private-NIC race as workers (server.tf); mirrors worker.tftest.hcl's regression coverage.

run "control_plane_cloud_init_configures_private_nic" {
  command = plan

  assert {
    condition     = strcontains(output.control_plane_rendered, "/etc/netplan/60-private-net.yaml")
    error_message = "control-plane cloud-init must write /etc/netplan/60-private-net.yaml so the hot-attached private NIC gets DHCP even when 50-cloud-init.yaml omits it — without it install-k3s.sh hangs on the enp7s0 wait and the node never joins."
  }

  assert {
    condition     = strcontains(output.control_plane_rendered, "dhcp4: true")
    error_message = "the private-net dropin must declare dhcp4: true, or the interface still never gets an address."
  }

  assert {
    condition     = strcontains(output.control_plane_rendered, "netplan apply")
    error_message = "install-k3s.sh must reapply netplan on each poll in case the private NIC attaches mid-wait, matching the worker fix."
  }
}
