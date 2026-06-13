local lang = require("lang")

local function test_glossary()
	for line in io.lines "Glossary.md" do

		local t = {}
		for word in line:gmatch("[^|]+") do
			word = word:match("%w+")
			table.insert(t, word)
		end

		if t[1] and t[1] ~= "Word" and not lang.parse_word(t[1]) then
			print("Bad word:", t[1])
		end

		if t[1] and lang.parse_word(t[1]) and t[4] then
			local plu = lang.plural_root(t[1])
			if plu ~= t[4] then
				print(t[1], t[4], plu)
			end
		end
	end
end

test_glossary()
