package com.bliss.grid.application.auth

import java.util.UUID

data class WhoAmI(
    val userId: UUID,
    val displayName: String,
    // Capabilities held by the session principal (ADR-0079); absent on the wire => empty => deny.
    val capabilities: Set<String> = emptySet(),
)
