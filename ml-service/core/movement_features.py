"""Same JSON-to-column mapping as the original ASDDatasetTrainer, without ML imports."""
def extract_features(data):
    agg = data.get('aggregated_features', {})
    features = {key: agg[key] for key in ('total_abrupt_movements', 'movements_per_minute') if key in agg}
    for pair, value in agg.get('symmetry_metrics', {}).items():
        features['symmetry_' + pair.replace(' ', '_').replace('_vs_', '_')] = value
    for part, values in agg.get('frequency_features', {}).items():
        prefix = part.replace(' ', '_').replace('ё', 'е')
        features[prefix + '_dominant_freq'] = values.get('dominant_frequency_hz')
        bounds = values.get('frequency_range_hz', [])
        features[prefix + '_freq_range'] = bounds[1] - bounds[0] if len(bounds) == 2 else None
    for part, values in agg.get('amplitude_features', {}).items():
        prefix = part.replace(' ', '_').replace('ё', 'е')
        for key in ('mean_speed', 'std_speed', 'max_speed', 'speed_variance'):
            features[prefix + '_' + key] = values.get(key)
    for part, value in agg.get('movement_frequency', {}).items():
        features[part.replace(' ', '_').replace('ё', 'е') + '_movement_freq'] = value
    for key in ('detection_rate', 'avg_keypoint_confidence'):
        if key in data.get('quality_metrics', {}): features['json_' + key] = data['quality_metrics'][key]
    if 'duration_sec' in data.get('video_metadata', {}): features['json_duration_sec'] = data['video_metadata']['duration_sec']
    return features
