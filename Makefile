.PHONY: demo

demo:
	@echo "Starting demo server and frontend..."
	@cd apps/demo-server && pnpm dev &
	@cd apps/demo && pnpm dev
