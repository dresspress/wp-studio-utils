.PHONY: patch minor major test

# Run tests
test:
	npm test

# Publish a patch version (1.1.x -> 1.1.x+1) - bug fixes
patch:
	npm version patch
	git push origin main --tags

# Publish a minor version (1.1.x -> 1.2.0) - new features
minor:
	npm version minor
	git push origin main --tags

# Publish a major version (1.x.x -> 2.0.0) - breaking changes
major:
	npm version major
	git push origin main --tags
