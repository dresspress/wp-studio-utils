.PHONY: patch minor major test

# 默认运行测试
test:
	npm test

# 发布补丁版本 (1.1.x -> 1.1.x+1) - 修复 bug
patch:
	npm version patch
	git push origin main --tags

# 发布次要版本 (1.1.x -> 1.2.0) - 新功能
minor:
	npm version minor
	git push origin main --tags

# 发布主要版本 (1.x.x -> 2.0.0) - 重大更新
major:
	npm version major
	git push origin main --tags
