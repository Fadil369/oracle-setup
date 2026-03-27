terraform {
  required_version = ">= 1.6.0"

  required_providers {
    docker = {
      source  = "kreuzwerker/docker"
      version = "~> 3.0"
    }
  }
}

provider "docker" {}

resource "docker_image" "oracle_free" {
  name         = var.oracle_image
  keep_locally = true
}

resource "docker_container" "oracle_db" {
  name    = var.container_name
  image   = docker_image.oracle_free.image_id
  restart = "unless-stopped"

  env = [
    "ORACLE_PASSWORD=${var.oracle_password}",
    "APP_USER=${var.app_user}",
    "APP_USER_PASSWORD=${var.app_user_password}",
    "ORACLE_DATABASE=${var.oracle_pdb}",
    "ORACLE_SID=${var.oracle_sid}",
  ]

  ports {
    internal = 1521
    external = var.oracle_port
  }

  ports {
    internal = 5500
    external = var.oracle_em_port
  }

  volumes {
    host_path      = abspath(var.oracle_data_dir)
    container_path = "/opt/oracle/oradata"
  }

  volumes {
    host_path      = abspath(var.oracle_init_dir)
    container_path = "/container-entrypoint-initdb.d"
    read_only      = true
  }

  networks_advanced {
    name = docker_network.oracle_dev.name
  }

  healthcheck {
    test         = ["CMD-SHELL", "healthcheck.sh"]
    interval     = "30s"
    timeout      = "10s"
    retries      = 10
    start_period = "120s"
  }
}