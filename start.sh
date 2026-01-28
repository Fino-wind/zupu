cat > start.sh <<'EOF'
#!/bin/sh
set -e
node server.js &
nginx -g "daemon off;"
EOF

chmod +x start.sh
