resource "docker_network" "oracle_dev" {
  name = var.network_name
}

output "oracle_connection_string" {
  value = "oracle://${var.app_user}:${var.app_user_password}@localhost:${var.oracle_port}/${var.oracle_pdb}"
}

output "oracle_container_name" {
  value = docker_container.oracle_db.name
}