local lang = require "lang"

local grammar =
{
	start = {"IT"},
	I = {"", 3, "V", 2},
	T = {"S", 1, "SS", 3, "SSS", 3, "SSSS", 1},
	S = {"CV", 3, "CVF", 2},

	C = {"F", 14, "w", "y"},

	F = {
		"b", 5, "d", 5, "f", 5,
		"sh", 4, "z", 4,
		"r", 3, "s", 3,
		"l", 2, "m", 2, "n", 2,
		"q", 1, "kh", 1, "j", 1,
	},
	V = {"a", 5, "u", 3, "i", 4, "aa", 1, "uu", "ii"}
}

local function random_element(array)
	return array[math.random(1,#array)]
end

local function flatten(arr)

	local res = {}

	for i,v in ipairs(arr) do

		if type(v) ~= "number" then

			local factor = 1
			local next = arr[i+1]
			if type(next) == "number" then
				factor = next
			end

			for i = 1,factor do
				table.insert(res, v)
			end
		end
	end

	return res
end

local function prepare_grammar(g)

	if g.__ready then
		return
	end

	for k,v in pairs(g) do
		g[k] = flatten(v)
	end

	g.__ready = true
end

local function generate(grammar, rule)

	prepare_grammar(grammar)

	rule = rule or "start"

	if not grammar[rule] then
		-- terminal!
		return rule
	end

	local pick = random_element(grammar[rule])

	local substrings = {}
	for _,cp in utf8.codes(pick) do

		local char = utf8.char(cp)
		table.insert(substrings, generate(grammar, char))
	end

	return table.concat(substrings)
end

local function make_words(grammar, n)

	for i = 1,n do
		local w = generate(grammar)
		-- print(w .. string.rep(" ", 20 - #w) .. lang.plural_root(w))
		io.write(w, " ")
	end

end

math.randomseed(os.time())
make_words(grammar, 1000)
