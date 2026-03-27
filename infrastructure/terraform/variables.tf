variable "oracle_image" {
  description = "Oracle Free image for local developer environments"
  type        = string
  default     = "gvenzl/oracle-free:23-slim"
}

variable "container_name" {
  description = "Name of the Oracle developer container"
  type        = string
  default     = "brainsait-oracle-dev"
}

variable "network_name" {
  description = "Docker network used by the Oracle developer stack"
  type        = string
  default     = "brainsait-oracle-network"
}

variable "oracle_port" {
  description = "Host port for Oracle SQL*Net"
  type        = number
  default     = 1521
}

variable "oracle_em_port" {
  description = "Host port for Oracle Enterprise Manager Express"
  type        = number
  default     = 5500
}

variable "oracle_password" {
  description = "SYS/SYSTEM password for the local Oracle developer stack"
  type        = string
  sensitive   = true
  default     = "oracle_dev_password"
}

variable "app_user" {
  description = "Application schema user"
  type        = string
  default     = "brainsait"
}

variable "app_user_password" {
  description = "Application schema password"
  type        = string
  sensitive   = true
  default     = "brainsait_app_password"
}

variable "oracle_sid" {
  description = "Oracle system identifier"
  type        = string
  default     = "FREE"
}

variable "oracle_pdb" {
  description = "Oracle pluggable database name"
  type        = string
  default     = "FREEPDB1"
}

variable "oracle_data_dir" {
  description = "Local directory used to persist Oracle data"
  type        = string
  default     = "../../.data/oracle"
}

variable "oracle_init_dir" {
  description = "Directory containing SQL bootstrap scripts"
  type        = string
  default     = "../../docker/initdb"
}