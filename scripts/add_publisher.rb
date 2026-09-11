#!/usr/bin/env ruby
# frozen_string_literal: true

require "csv"
require "optparse"

ROOT = File.expand_path("..", __dir__)
DATA = File.join(ROOT, "data")
SOURCES = File.join(ROOT, "sources")

force = ARGV.delete("--force")
abort "usage: ruby scripts/add_publisher.rb [--force]" unless ARGV.empty?

release_path = File.join(DATA, "releases.csv")
table = CSV.read(release_path, headers: true, encoding: "bom|utf-8")
headers = table.headers
if headers.include?("publisher") && table.any? { |row| !row["publisher"].to_s.strip.empty? } && !force
  abort "releases.csv already contains non-empty publisher values; use --force to overwrite"
end

source_ids = table.map { |row| row["source_id"].to_s.strip }.uniq
maps = {}
skipped = []
conflicts = Hash.new(0)

source_ids.each do |source_id|
  path = File.join(SOURCES, "#{source_id}.csv")
  unless File.file?(path)
    skipped << source_id
    next
  end

  source = CSV.read(path, headers: true, encoding: "bom|utf-8")
  publisher_column = if source.headers.include?("publisher")
                       "publisher"
                     elsif source.headers.include?("メーカー")
                       "メーカー"
                     end
  unless publisher_column
    skipped << source_id
    next
  end

  date_column = source.headers.include?("release_date") ? "release_date" : "発売日"
  title_column = source.headers.include?("title") ? "title" : "タイトル"
  maps[source_id] = {}
  source.each do |row|
    key = [row[date_column].to_s.strip, row[title_column].to_s.strip]
    publisher = row[publisher_column].to_s.strip
    current = maps[source_id][key]
    if current.nil? || (current.empty? && !publisher.empty?)
      maps[source_id][key] = publisher
    elsif !publisher.empty? && current != publisher
      conflicts[source_id] += 1
    end
  end
end

headers = (headers + ["publisher"]).uniq
counts = Hash.new { |h, k| h[k] = { rows: 0, matched: 0 } }
anomalies = Hash.new { |h, k| h[k] = [] }
table.each do |row|
  sid = row["source_id"].to_s.strip
  key = [row["release_date"].to_s.strip, row["title"].to_s.strip]
  publisher = maps.fetch(sid, {})[key].to_s
  row["publisher"] = publisher
  counts[sid][:rows] += 1
  counts[sid][:matched] += 1 unless publisher.empty?
  anomalies[sid] << publisher if publisher.match?(/[0-9０-９]|円/) && !anomalies[sid].include?(publisher)
end

CSV.open(release_path, "w", write_headers: true, headers: headers, encoding: "UTF-8") do |csv|
  table.each { |row| csv << headers.map { |header| v = row[header].to_s; v.empty? ? nil : v } }
end

total_rows = table.length
total_matched = counts.values.sum { |c| c[:matched] }
puts "source_id,rows,matched,unmatched,match_rate,conflicts"
source_ids.each do |sid|
  c = counts[sid]
  unmatched = c[:rows] - c[:matched]
  rate = c[:rows].zero? ? 0.0 : c[:matched].fdiv(c[:rows]) * 100
  puts format("%s,%d,%d,%d,%.2f%%,%d", sid, c[:rows], c[:matched], unmatched, rate, conflicts[sid])
end
puts format("TOTAL,%d,%d,%d,%.2f%%", total_rows, total_matched, total_rows - total_matched,
            total_rows.zero? ? 0.0 : total_matched.fdiv(total_rows) * 100)
puts "skipped source files: #{skipped.empty? ? '(none)' : skipped.join(', ')}"
puts "anomalous publishers (containing digits or 円):"
anomalous_ids = source_ids.select { |sid| !anomalies[sid].empty? }
if anomalous_ids.empty?
  puts "  (none)"
else
  anomalous_ids.each { |sid| puts "  #{sid}: #{anomalies[sid].join(' / ')}" }
end
