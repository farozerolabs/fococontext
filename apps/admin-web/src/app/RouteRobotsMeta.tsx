import { useEffect } from "react"
import { useLocation } from "react-router"

import { updateRouteSearchMetadata } from "@/app/robots-metadata.js"

export function RouteRobotsMeta() {
  const location = useLocation()

  useEffect(() => {
    updateRouteSearchMetadata(location.pathname)
  }, [location.pathname])

  return null
}
