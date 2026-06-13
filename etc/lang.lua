local re = require "re"
--local inspect = require "inspect"

local gram = re.compile [[
	word <- {| head? tail* |} !.
	head <- {| V closing? |}
	tail <- {| C V closing? |}
	closing <- C (&C / !.)
	V <- { "aa" / "uu" / "ii" / [aui] }
	C <- { "kh" / "sh" / [mnqbdjfszrlyw] }
]]

local function copy(t)
	if type(t) ~= "table" then
		return t
	end

	local t2 = {}
	for k,v in pairs(t) do
		t2[k] = v
	end
	return t2
end

local function parse_word(string)
	if type(string) == "table" then
		return copy(string)
	else
		return gram:match(string)
	end
end

local function flatten(word)
	local res = ""
	for i,v in ipairs(word) do
		res = res .. table.concat(v)
	end

	return res
end

local function is_vowel(s)
	return s:match("[aui]") ~= nil
end

local function is_consonant(c)
	return not is_vowel(c)
end

local function is_long(v)
	return #v == 2
end

local function to_short(v)
	if not is_vowel(v) then
		return v
	end
	return v:sub(1,1)
end

local function to_long(v)
	if is_long(v) then
		return v
	else
		return v .. v
	end
end

local links = {
	a = {a = "w", u = "kh", i = "y"},
	u = {a = "w", u = "kh", i = "y"},
	i = {a = "y", u = "y", i = "w"},
}

local function get_link(v, w)
	v,w = to_short(v),to_short(w)

	return links[v] and links[v][w]
end

local function plural_root(word)
	word = parse_word(word)
	if not word then
		return
	end

	if #word == 1 and is_vowel(word[1][1]) then
		print("Not decided on vowel starting single syllable words :P")
		return nil
	end

	-- Shorten all

	for _, syll in ipairs(word) do
		for i = 1,#syll do
			syll[i] = to_short(syll[i])
		end
	end

	-- CV --> VC
	-- CVC --> VCCi

	local last = word[#word]
	assert(#last >= 2)

	last[1], last[2] = last[2], last[1]
	last[1] = to_long(last[1])

	-- Final semivowel reduction

	if last[2] == "w" then
		 last[2] = "f"
	elseif last[2] == "y" then
		 last[2] = "q"
	end

	if last[3] then
		last[4] = "i"
	end

	-- Linking semivowel

	local prev = word[#word - 1]
	if prev then
		local link = get_link(prev[#prev], last[1])
		if link then
			table.insert(last, 1, link)
		end
	end

	return flatten(word)
end

return {
	parse_word = parse_word,
	plural_root = plural_root
}
