import { Body } from '@/components/Typography';
import { useTheme } from '@/hooks/useThemeColor';
import type { FileItem as FileItemType } from '@/stores/file-browser-store';
import { File, Folder } from 'lucide-react-native';
import React, { useState, useRef, useCallback } from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { Tooltip } from './Tooltip';

interface FileItemProps {
    item: FileItemType;
    onPress: (item: FileItemType) => void;
    onLongPress?: (item: FileItemType) => void;
}

export const FileItem: React.FC<FileItemProps> = ({
    item,
    onPress,
    onLongPress
}) => {
    const theme = useTheme();
    const [isTruncated, setIsTruncated] = useState(false);

    const formatFileSize = (size?: number): string => {
        if (!size) return '';
        if (size < 1024) return `${size} B`;
        if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
        return `${(size / (1024 * 1024)).toFixed(1)} MB`;
    };

    const getFileIcon = () => {
        if (item.isDirectory) {
            return <Folder size={24} color={theme.primary} />;
        } else {
            return <File size={24} color={theme.mutedForeground} />;
        }
    };

    const [showTooltip, setShowTooltip] = useState(false);
    const textRef = useRef<View>(null);
    const [textPosition, setTextPosition] = useState({ x: 0, y: 0, width: 0, height: 0 });

    const handleTextLayout = (e: any) => {
        // Check if text is truncated by comparing number of lines
        if (e.nativeEvent.lines.length > 1 || e.nativeEvent.lines[0]?.text !== item.name) {
            setIsTruncated(true);
        }
    };

    const handleTextPress = useCallback(() => {
        if (!isTruncated) return;
        
        if (textRef.current) {
            textRef.current.measure((x, y, width, height, pageX, pageY) => {
                setTextPosition({ x: pageX, y: pageY, width, height });
                setShowTooltip(true);
                
                // Auto-hide after 2.5 seconds
                setTimeout(() => {
                    setShowTooltip(false);
                }, 2500);
            });
        }
    }, [isTruncated]);

    return (
        <>
            <TouchableOpacity
                style={[
                    styles.container,
                    {
                        backgroundColor: theme.card,
                        borderColor: theme.border
                    }
                ]}
                onPress={() => onPress(item)}
                onLongPress={() => onLongPress?.(item)}
                activeOpacity={0.7}
            >
                <View style={styles.iconContainer}>
                    {getFileIcon()}
                </View>

                <View style={styles.contentContainer}>
                    <TouchableOpacity 
                        onPress={handleTextPress}
                        disabled={!isTruncated}
                        activeOpacity={0.7}
                    >
                        <View ref={textRef} style={styles.fileNameWrapper}>
                            <Body
                                style={[
                                    styles.fileName,
                                    { color: theme.foreground }
                                ]}
                                numberOfLines={2}
                                onTextLayout={handleTextLayout}
                            >
                                {item.name}
                            </Body>
                        </View>
                    </TouchableOpacity>

                    {!item.isDirectory && item.size && (
                        <Body
                            style={[
                                styles.fileSize,
                                { color: theme.mutedForeground }
                            ]}
                        >
                            {formatFileSize(item.size)}
                        </Body>
                    )}
                </View>
            </TouchableOpacity>

            {isTruncated && showTooltip && (
                <Tooltip 
                    content={item.name}
                    visible={showTooltip}
                    position={textPosition}
                    onClose={() => setShowTooltip(false)}
                />
            )}
        </>
    );
};

const styles = StyleSheet.create({
    container: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 12,
        marginVertical: 2,
        marginHorizontal: 8,
        borderRadius: 8,
        borderWidth: 1,
    },
    iconContainer: {
        marginRight: 12,
        alignItems: 'center',
        justifyContent: 'center',
        width: 32,
        height: 32,
    },
    contentContainer: {
        flex: 1,
        justifyContent: 'center',
    },
    fileName: {
        fontSize: 16,
        fontWeight: '500',
        lineHeight: 20,
    },
    fileNameWrapper: {
        width: '100%',
    },
    fileSize: {
        fontSize: 12,
        marginTop: 2,
    },
}); 