import { Body } from '@/components/Typography';
import { useTheme } from '@/hooks/useThemeColor';
import React, { useRef, useEffect } from 'react';
import {
    View,
    StyleSheet,
    Modal,
    TouchableWithoutFeedback,
    Dimensions,
    Animated,
    Platform,
} from 'react-native';

interface TooltipProps {
    content: string;
    visible: boolean;
    position: { x: number; y: number; width: number; height: number };
    onClose: () => void;
}

export const Tooltip: React.FC<TooltipProps> = ({ content, visible, position, onClose }) => {
    const theme = useTheme();
    const fadeAnim = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        if (visible) {
            Animated.timing(fadeAnim, {
                toValue: 1,
                duration: 150,
                useNativeDriver: true,
            }).start();
        } else {
            Animated.timing(fadeAnim, {
                toValue: 0,
                duration: 100,
                useNativeDriver: true,
            }).start();
        }
    }, [visible, fadeAnim]);

    const screenWidth = Dimensions.get('window').width;
    const tooltipMaxWidth = screenWidth - 32; // 16px padding on each side
    
    // Calculate tooltip position - center it horizontally, show above the text
    const tooltipLeft = Math.max(16, Math.min(position.x, screenWidth - tooltipMaxWidth - 16));
    const tooltipTop = position.y - 50; // Show above the item

    if (!visible) return null;

    return (
        <Modal
            visible={visible}
            transparent
            animationType="none"
            onRequestClose={onClose}
        >
            <TouchableWithoutFeedback onPress={onClose}>
                <View style={styles.overlay}>
                    <Animated.View
                        style={[
                            styles.tooltip,
                            {
                                backgroundColor: theme.popover,
                                borderColor: theme.border,
                                left: tooltipLeft,
                                top: tooltipTop,
                                maxWidth: tooltipMaxWidth,
                                opacity: fadeAnim,
                                transform: [
                                    {
                                        translateY: fadeAnim.interpolate({
                                            inputRange: [0, 1],
                                            outputRange: [-5, 0],
                                        }),
                                    },
                                ],
                            },
                        ]}
                    >
                        <Body
                            style={[
                                styles.tooltipText,
                                { color: theme.popoverForeground }
                            ]}
                        >
                            {content}
                        </Body>
                        {/* Arrow pointing down */}
                        <View
                            style={[
                                styles.arrow,
                                {
                                    backgroundColor: theme.popover,
                                    borderRightColor: theme.border,
                                    borderBottomColor: theme.border,
                                },
                            ]}
                        />
                    </Animated.View>
                </View>
            </TouchableWithoutFeedback>
        </Modal>
    );
};

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: 'transparent',
    },
    tooltip: {
        position: 'absolute',
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 8,
        borderWidth: 1,
        ...Platform.select({
            ios: {
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.15,
                shadowRadius: 8,
            },
            android: {
                elevation: 4,
            },
        }),
    },
    tooltipText: {
        fontSize: 14,
        lineHeight: 18,
    },
    arrow: {
        position: 'absolute',
        bottom: -6,
        left: '50%',
        marginLeft: -6,
        width: 12,
        height: 12,
        transform: [{ rotate: '45deg' }],
        borderRightWidth: 1,
        borderBottomWidth: 1,
    },
});

