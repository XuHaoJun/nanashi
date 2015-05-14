if redis.call("GETBIT", KEYS[1], ARGV[1]) == 0 then
   return redis.call("SETBIT", KEYS[1], ARGV[1], 1)
else
  return nil
end
