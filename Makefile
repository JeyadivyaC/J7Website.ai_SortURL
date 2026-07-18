# Invoked by `sam build` (Metadata.BuildMethod: makefile on ShortUrlFunction
# in template.yaml). SAM sets ARTIFACTS_DIR to the directory the built
# Lambda package must be assembled into.
#
# Ordering matters: `prisma generate` must run BEFORE `npm prune`, because
# the `prisma` CLI itself is a devDependency - pruning first would remove it.
# `npm prune` (not a second `npm ci`) is used afterwards so the already
# generated Prisma engine binary under node_modules/@prisma/client is left
# untouched rather than wiped by a clean reinstall.
build-ShortUrlFunction:
	npm ci
	npx prisma generate
	npm run build
	npm prune --omit=dev
	mkdir -p "$(ARTIFACTS_DIR)"
	cp -r dist "$(ARTIFACTS_DIR)/dist"
	cp -r node_modules "$(ARTIFACTS_DIR)/node_modules"
	cp package.json package-lock.json "$(ARTIFACTS_DIR)/"
	# Served live via src/docs/docs.controller.ts (GET /openapi.yaml,
	# GET /swagger-ui.html) - process.cwd() at Lambda runtime is this
	# artifact root, so these need to sit right here, not under dist/.
	cp openapi.yaml swagger-ui.html "$(ARTIFACTS_DIR)/"
