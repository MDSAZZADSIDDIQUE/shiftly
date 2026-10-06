import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // Lets a second dev server (e.g. against local Supabase) run alongside the usual one.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  async rewrites() {
    // Older ZKTeco firmware calls the .aspx variants of the push endpoints.
    return [
      { source: "/iclock/cdata.aspx", destination: "/iclock/cdata" },
      { source: "/iclock/getrequest.aspx", destination: "/iclock/getrequest" },
      { source: "/iclock/devicecmd.aspx", destination: "/iclock/devicecmd" },
    ];
  },
};

export default nextConfig;
